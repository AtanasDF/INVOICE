// A job: everything about one piece of work in one place -- what was
// invoiced, what it cost, and what is left over. No new table: invoices and
// receipts already carry tags, and a job IS a tag. That also means a job
// can be started after the fact, which is how it will happen -- nobody
// decides something is a "job" until the second invoice for it.
import { jobs, isJobTag } from "./gen/lib/jobs.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const same = (a, b) => Math.round(a * 100) === Math.round(b * 100);
const J = (x) => JSON.stringify(x);

const inv = (o) => ({ id: o.id, clientId: "c1", date: o.date, number: o.id, items: [{ description: "Work", quantity: 1, unitPrice: o.net, vatRate: "standard", kind: "labour" }], notes: "", dueDate: null, paymentTerms: "", status: o.status ?? "sent", tags: o.tags ?? [], vatRegistered: true, cisRate: o.cisRate ?? null });
const rec = (o) => ({ id: o.id, clientId: null, date: o.date, vendor: o.vendor ?? "Jewson", category: "Supplies", amount: o.net, vatAmount: Math.round(o.net * 0.2 * 100) / 100, imageDataUrl: null, notes: "", starred: false, needsReview: false, warrantyMonths: null, tags: o.tags ?? [], lineItems: [], documentType: "receipt", invoiceNumber: null, dueDate: null, paid: true, details: {}, creditOfReceiptId: null, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null });

// The tags the app writes itself are not jobs.
check("a tag the app wrote to link a quote is not a job", !isJobTag("from Q-0001") && !isJobTag("deposit for Q-0001"));
check("a tag somebody typed is", isJobTag("Willow Road") && isJobTag("Unit 4"));
check("and an empty one is nothing at all", !isJobTag("   "));

const invoices = [
  inv({ id: "A", date: "2026-05-01", net: 2000, tags: ["Willow Road"] }),
  inv({ id: "B", date: "2026-06-01", net: 1000, tags: ["Willow Road", "from Q-0001"] }),
  inv({ id: "C", date: "2026-06-05", net: 500, tags: ["Unit 4"] }),
  inv({ id: "D", date: "2026-06-09", net: 900, tags: ["Willow Road"], status: "draft" }),
  inv({ id: "E", date: "2026-06-10", net: 700, tags: ["from Q-0002"] }),
];
const receipts = [
  rec({ id: "r1", date: "2026-05-02", net: 400, tags: ["Willow Road"] }),
  rec({ id: "r2", date: "2026-05-09", net: 100, tags: ["Willow Road"] }),
  rec({ id: "r3", date: "2026-06-06", net: 50, tags: ["Unit 4"] }),
  rec({ id: "r4", date: "2026-06-07", net: 999, tags: [] }),
];

let list = jobs(invoices, receipts, [], [], true);
check("a job is made of the tags people typed, and nothing else", list.map((j) => j.name).sort().join(",") === "Unit 4,Willow Road", J(list.map((j) => j.name)));
const willow = list.find((j) => j.name === "Willow Road");

// 2000 + 1000 = 3000 net, +20% = 3600 invoiced. A draft was never sent.
check("a draft invoice is not money anybody owes, so it is not in the job", same(willow.invoiced, 3600) && willow.invoices.length === 2, J({ invoiced: willow.invoiced, count: willow.invoices.length }));
// 400 + 100 net, +20% = 600 spent.
check("what it cost is every receipt tagged with it, VAT included, because that is the money that left", same(willow.spent, 600), String(willow.spent));
check("what is left over is one less the other", same(willow.left, 3000), String(willow.left));
check("an untagged receipt belongs to no job", !list.some((j) => j.receipts.some((r) => r.id === "r4")));
check("a job carries a tag the app wrote as well without being confused by it", willow.invoices.some((i) => i.id === "B"), J(willow.invoices.map((i) => i.id)));
check("the job worked on most recently comes first", list[0].name === "Unit 4", J(list.map((j) => [j.name, j.lastActivity])));

// Money in: what has been received, and what is still owed.
list = jobs(invoices, receipts, [], [{ id: "p", invoiceId: "A", date: "2026-05-20", amount: 1000, method: "bank", note: "" }], true);
const paid = list.find((j) => j.name === "Willow Road");
check("what has come in is counted", same(paid.received, 1000), String(paid.received));
check("and what is still owed on the job with it", same(paid.owed, 3600 - 1000), String(paid.owed));

// A credit note comes off what was invoiced.
list = jobs(invoices, receipts, [{ id: "cn", invoiceId: "A", date: "2026-05-21", amount: 600, reason: "" }], [], true);
check("a credit note comes off what the job invoiced", same(list.find((j) => j.name === "Willow Road").invoiced, 3000), String(list.find((j) => j.name === "Willow Road").invoiced));

// A supplier's credit note is stored negative, so a refund reduces the cost
// without a special case.
list = jobs(invoices, [...receipts, { ...rec({ id: "r5", date: "2026-05-11", net: -100, tags: ["Willow Road"] }), vatAmount: -20 }], [], [], true);
check("money a supplier gave back reduces what the job cost", same(list.find((j) => j.name === "Willow Road").spent, 480), String(list.find((j) => j.name === "Willow Road").spent));

// CIS: what the customer owes is the total less the deduction.
list = jobs([inv({ id: "K", date: "2026-05-01", net: 1000, tags: ["CIS job"], cisRate: 20 })], [], [], [], true);
check("a CIS job counts what the customer actually pays", same(list[0].invoiced, 1000), String(list[0].invoiced));

check("no tags at all means no jobs, not an empty one", jobs([inv({ id: "Z", date: "2026-01-01", net: 10 })], [], [], [], true).length === 0);

// ── On the screen ──
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.invoices.push({ id: newId(), user_id: "x", client_id: C, date: day(-20), number: "INV-000001", items: [{ description: "Work", quantity: 1, unitPrice: 2000, vatRate: "standard" }], notes: "", due_date: day(-5), payment_terms: "", status: "sent", tags: ["Willow Road"], vat_registered: true, cis_rate: null });
const R = newId();
db.tables.receipts.push({ id: R, user_id: "x", client_id: null, date: day(-18), vendor: "Jewson", category: "Supplies", amount: 400, vat_amount: 80, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: ["Willow Road"], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-jobs" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Willow Road"), { timeout: 20000 });
  const t = await bodyText(page);
  check("the job is named, with what it brought in and what it cost", /Willow Road/.test(t) && /£2,400\.00/.test(t) && /£480\.00/.test(t), t.replace(/\s+/g, " ").slice(0, 400));
  check("and what is left over", /£1,920\.00/.test(t), t.replace(/\s+/g, " ").slice(0, 400));
  check("it says what is still owed", /still owed/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("it fits a phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /What is in it/.test(b.textContent))?.click());
  await sleep(700);
  const opened = await bodyText(page);
  check("opening it lists the invoices and the receipts behind the figures", /INV-000001/.test(opened) && /Jewson/.test(opened), opened.replace(/\s+/g, " ").slice(0, 400));
  const links = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")));
  check("and each one goes to the document itself", links.some((h) => /^\/invoices\//.test(h)) && links.some((h) => /^\/receipts\?open=/.test(h)), J(links.slice(0, 8)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
