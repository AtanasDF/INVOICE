// "Same again": last month's invoice to this customer, dated today.
//
// The strongest friction-reducer in notes/competitor-research.md, and the
// one competitors charge for -- Tide £5.99+VAT a month, Square £20. It
// already existed here as Duplicate, but only on the invoice itself, which
// means finding last month's first. For somebody billing the same
// contractor every month that is four steps before they have typed
// anything.
//
// What matters is which invoice it offers and when it stays quiet, because
// offering the wrong one is worse than offering nothing: it produces a
// confident, wrong invoice.
import { sameAgainOptions, worthOffering } from "./gen/lib/sameAgain.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const inv = (o) => ({ id: o.id ?? o.number, clientId: o.clientId, number: o.number, date: o.date, status: o.status ?? "sent", items: o.items ?? [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], cisRate: o.cisRate ?? null, notes: "", dueDate: o.date, paymentTerms: "", tags: o.tags ?? [], vatRegistered: true });

// ---- Which one it offers -----------------------------------------------------
const many = [
  inv({ clientId: "a", number: "INV-1", date: "2026-01-10" }),
  inv({ clientId: "a", number: "INV-4", date: "2026-03-10" }),
  inv({ clientId: "a", number: "INV-2", date: "2026-02-10" }),
  inv({ clientId: "b", number: "INV-3", date: "2026-02-11" }),
];
const opts = sameAgainOptions(many);
check("the most recent invoice to a customer is the one offered", opts.find((o) => o.clientId === "a")?.invoice.number === "INV-4", JSON.stringify(opts.map((o) => [o.clientId, o.invoice.number])));
check("and it counts how many they have sent", opts.find((o) => o.clientId === "a")?.sent === 3, JSON.stringify(opts));
check("the customer billed most often comes first", opts[0].clientId === "a", JSON.stringify(opts.map((o) => o.clientId)));

// Two invoices dated the same day: the second one issued is the later one.
const sameDay = [inv({ clientId: "a", number: "INV-000008", date: "2026-03-10" }), inv({ clientId: "a", number: "INV-000009", date: "2026-03-10" })];
check("two on one day are ordered by number, not by luck", sameAgainOptions(sameDay)[0].invoice.number === "INV-000009", JSON.stringify(sameAgainOptions(sameDay)[0].invoice.number));

// ---- When it must stay quiet --------------------------------------------------
// A draft is not "the same again" -- it is something they never finished,
// and copying it multiplies unfinished work.
const drafts = [inv({ clientId: "a", number: "d1", date: "2026-03-01", status: "draft" }), inv({ clientId: "a", number: "INV-7", date: "2026-01-01" })];
check("a draft is never offered as the last invoice", sameAgainOptions([...drafts, inv({ clientId: "a", number: "INV-6", date: "2025-12-01" })])[0].invoice.number === "INV-7", JSON.stringify(sameAgainOptions([...drafts, inv({ clientId: "a", number: "INV-6", date: "2025-12-01" })])));
check("an invoice with no customer is skipped", sameAgainOptions([inv({ clientId: "", number: "x", date: "2026-01-01" })]).length === 0);
check("nothing at all offers nothing", sameAgainOptions([]).length === 0);

// One invoice to one customer is not a habit.
check("a single invoice is not worth offering", worthOffering(sameAgainOptions([inv({ clientId: "a", number: "INV-1", date: "2026-01-01" })])) === false);
check("two to the same customer is", worthOffering(sameAgainOptions([inv({ clientId: "a", number: "INV-1", date: "2026-01-01" }), inv({ clientId: "a", number: "INV-2", date: "2026-02-01" })])) === true);
check("but two to different customers is not", worthOffering(sameAgainOptions([inv({ clientId: "a", number: "INV-1", date: "2026-01-01" }), inv({ clientId: "b", number: "INV-2", date: "2026-02-01" })])) === false);
check("a customer billed once is not offered at all", sameAgainOptions([inv({ clientId: "a", number: "INV-1", date: "2026-01-01" })]).length === 0);
check("never more than three at once", sameAgainOptions(["a", "b", "c", "d", "e"].flatMap((c, i) => [inv({ clientId: c, number: `A${i}`, date: "2026-01-01" }), inv({ clientId: c, number: `B${i}`, date: "2026-02-01" })])).length === 3);

// ---- On the page --------------------------------------------------------------
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 30, address: "1 Test Street", custom_categories: null });
const REG = newId(), ONCE = newId();
db.tables.clients.push(
  { id: REG, user_id: "x", name: "Redland Builders Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null },
  { id: ONCE, user_id: "x", name: "One Off Ltd", email: "c@d.e", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null }
);
const row = (clientId, number, date, status, tags) => ({ id: newId(), user_id: "x", client_id: clientId, date, number, items: [{ description: "Skim two bedrooms", quantity: 1, unitPrice: 900, vatRate: "standard", kind: "labour" }], notes: "Leave the key next door", due_date: day(30), payment_terms: "30 days", status, tags: tags ?? [], vat_registered: true, cis_rate: 20 });
db.tables.invoices.push(
  row(REG, "INV-000021", day(-60), "paid"),
  row(REG, "INV-000025", day(-30), "sent", ["from Q-14"]),
  row(ONCE, "INV-000026", day(-10), "sent")
);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-same-again" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const listed = await bodyText(page);
  check("the list offers Same again", /Same again/.test(listed), listed.slice(0, 200));
  check("for the customer billed twice", /Redland Builders Ltd/.test(listed.split("Same again")[1] ?? ""), (listed.split("Same again")[1] ?? "").slice(0, 160));
  check("and not for the one billed once", !/One Off Ltd/.test((listed.split("Same again")[1] ?? "").split("Filter")[0] ?? ""), (listed.split("Same again")[1] ?? "").slice(0, 200));
  check("it names the invoice it will copy", /INV-000025/.test((listed.split("Same again")[1] ?? "").split("Filter")[0] ?? ""), (listed.split("Same again")[1] ?? "").slice(0, 200));

  const before = db.tables.invoices.length;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Redland Builders Ltd"));
    b?.click();
  });
  await sleep(2200);
  check("pressing it makes exactly one new invoice", db.tables.invoices.length === before + 1, String(db.tables.invoices.length - before));
  const made = db.tables.invoices[db.tables.invoices.length - 1];
  check("it is a draft, with no real number taken", made.status === "draft" && !/^INV-0000\d\d$/.test(made.number), JSON.stringify({ status: made.status, number: made.number }));
  check("dated today, not last month", made.date === (await page.evaluate(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }))), made.date);
  check("the work and the terms come with it", made.items[0].description === "Skim two bedrooms" && made.payment_terms === "30 days" && made.cis_rate === 20, JSON.stringify({ i: made.items[0], t: made.payment_terms, c: made.cis_rate }));
  check("the notes come too", made.notes === "Leave the key next door", JSON.stringify(made.notes));
  // A copy is not the invoice a quote became.
  check("but the quote's tag does not", !made.tags.includes("from Q-14"), JSON.stringify(made.tags));
  check("and it opens the new invoice", /\/invoices\/[0-9a-f-]{8}/.test(page.url()) && !page.url().endsWith("/invoices"), page.url());
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
