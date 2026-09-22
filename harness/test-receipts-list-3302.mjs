import { makeDb, launchSignedIn, signIn, sleep, shot, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3302";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const T = day(0);

const img = (colour) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="60" height="80" fill="${colour}"/></svg>`).toString("base64");
const db = makeDb();
const S1 = newId(), S2 = newId(), S3 = newId(), C1 = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push(
  { id: S1, user_id: "x", name: "Screwfix", kind: "supplier", archived: false, email: "", is_company: true },
  { id: S2, user_id: "x", name: "Amazon", kind: "supplier", archived: false, email: "", is_company: true },
  { id: S3, user_id: "x", name: "Travis Perkins", kind: "supplier", archived: true, email: "", is_company: true },
  { id: C1, user_id: "x", name: "Acme Ltd", kind: "client", archived: false, email: "", is_company: true }
);
const fullDetails = {
  accountNumber: "12345678", sortCode: "20-00-00", iban: "GB33BUKB20201555555555", bic: "BUKBGB22",
  paymentTerms: "30 days from invoice date", reference: "SF-REF-99812", poNumber: "PO-5521", orderNumber: "ORD-7781-22",
  customerReference: "CUST-000123456789", supplierAddress: "Trade House, Mead Avenue, Houndstone Business Park, Yeovil, Somerset BA22 8RT",
  supplierVatNumber: "GB 232 4567 89", supplierEmail: "trade.accounts.department@screwfix-example.co.uk", supplierPhone: "0330 123 4567",
  deliveryAddress: "Unit 4, Long Industrial Estate Name That Goes On, Somewhere, AB12 3CD",
  other: [{ label: "Account manager", value: "Sam Taylor" }, { label: "Delivery note", value: "DN-44120" }],
};
const lines = [
  { description: "Wood screws 4x40 (box of 200)", quantity: 3, unitPrice: 6.49, category: "Materials" },
  { description: "Grab adhesive C4 290ml", quantity: 6, unitPrice: 4.99 },
  { description: "Masonry drill bit set", quantity: 1, unitPrice: 24.99 },
  { description: "Delivery", quantity: 1, unitPrice: 5 },
];
const base = { user_id: "x", original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null, image_data_url: null, notes: null, starred: false, warranty_months: null, tags: [], line_items: [], needs_review: false, details: {}, credit_of_receipt_id: null, invoice_number: null, due_date: null, paid: true, category: "Materials" };
const R = {};
const add = (key, row) => { R[key] = newId(); return { ...base, id: R[key], ...row }; };
const rows = [
  add("r1", { document_type: "invoice", client_id: S1, vendor: "Screwfix Direct", date: T, invoice_number: "SFX-4402119", due_date: day(2), paid: false, amount: 101.44, vat_amount: 20.29, image_data_url: img("#ccc"), notes: "Bathroom job at Elm Road", tags: ["elm-road"], line_items: lines, details: fullDetails }),
  add("r2", { document_type: "invoice", client_id: null, vendor: "Amazon EU S.a r.l.", date: day(-1), invoice_number: "INV-GB-2026-1234", paid: true, amount: 41.66, vat_amount: 8.33, image_data_url: img("#ddd"), category: "Office supplies", details: { orderNumber: "204-1234567-7654321", supplierVatNumber: "GB727255821", supplierAddress: "1 Principal Place, Worship Street, London EC2A 2FA" }, line_items: [{ description: "USB-C hub", quantity: 1, unitPrice: 49.99 }] }),
  add("r3", { document_type: "invoice", client_id: null, vendor: "AMAZON", date: day(-2), invoice_number: "INV-GB-2026-0999", due_date: day(-10), paid: false, amount: 20, vat_amount: 4, category: "Office supplies" }),
  add("r4", { document_type: "receipt", client_id: null, vendor: "Tesco Express", date: day(-3), amount: 8.5, vat_amount: 0, category: "Subsistence", image_data_url: img("#eee") }),
  add("r5", { document_type: "credit_note", client_id: S1, vendor: "Screwfix", date: day(-4), invoice_number: "CN-88120", amount: -10, vat_amount: -2, credit_of_receipt_id: null }),
  add("r6", { document_type: "invoice", client_id: S1, vendor: "Screwfix", date: day(-5), invoice_number: "SFX-4400001", due_date: day(8), paid: false, amount: 300, vat_amount: 60 }),
  add("r7", { document_type: "invoice", client_id: null, vendor: "Travis Perkins Ltd", date: day(-6), invoice_number: "TP-1", paid: false, amount: 50, vat_amount: 10 }),
  add("r8", { document_type: "invoice", client_id: S2, vendor: "Amazon", date: day(-7), invoice_number: "EMAILED-1", due_date: day(5), paid: false, needs_review: true, amount: 15, vat_amount: 3 }),
  add("r9", { document_type: "receipt", client_id: null, vendor: "Shell", date: day(-8), amount: 50, vat_amount: 10, category: "Fuel", image_data_url: img("#bbb"), original_amount: 70, original_vat_amount: 14, original_currency: "EUR", fx_rate: 0.8571 }),
  add("r10", { document_type: "invoice", client_id: null, vendor: "Screwfix Direct Ltd", date: day(-9), invoice_number: "SFX-4399000", due_date: day(7), paid: false, amount: 12.5, vat_amount: 2.5 }),
];
rows.find((r) => r.id === R.r5).credit_of_receipt_id = R.r1;
db.tables.receipts = rows;
db.tables.receipt_pages = [{ id: newId(), user_id: "x", receipt_id: R.r1, page_index: 1, image_data_url: img("#999") }, { id: newId(), user_id: "x", receipt_id: R.r1, page_index: 2, image_data_url: img("#999") }];
const clientCount = db.tables.clients.length;

const waitText = (page, t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 30000 }, t);
const cards = (page) => page.evaluate(() => [...document.querySelectorAll("main div.space-y-2 > div.rounded-xl")].map((c) => ({ text: c.innerText, h: c.getBoundingClientRect().height })));
const cardText = async (page, needle) => (await cards(page)).find((c) => c.text.includes(needle))?.text ?? "";
const clickInCard = (page, needle, label) => page.evaluate((n, l) => {
  const c = [...document.querySelectorAll("main div.space-y-2 > div.rounded-xl")].find((x) => x.innerText.includes(n));
  const b = [...c.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(l));
  b.click();
}, needle, label);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const titles = async (page) => (await cards(page)).map((c) => c.text.split("\n")[0]);
const bannerText = (page) => page.evaluate(() => [...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("your suppliers"))?.innerText ?? "");
const ticks = (page) => page.evaluate(() => [...[...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("your suppliers"))?.querySelectorAll("input[type=checkbox]") ?? []].map((c) => c.checked));
const clickButton = (page, label) => page.evaluate((l) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l && !x.disabled); if (!b) throw new Error("no button " + l); b.click(); }, label);
const untick = (page, needle) => page.evaluate((n) => { const l = [...document.querySelectorAll("main label")].find((x) => x.innerText.includes(n)); l.querySelector("input").click(); }, needle);
const skips = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("receipts-link-skip") ?? "[]"));
const reloadReceipts = async (page) => { await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" }); await waitText(page, "SFX-4402119"); await sleep(400); };

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-receipts-fixes" });
try {
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await waitText(page, "SFX-4402119");
  await sleep(500);

  const body = await page.evaluate(() => document.body.innerText);
  check("heading says receipts and bills", /Receipts & bills/.test(body) && /supplier invoices \(bills\)/.test(body));
  let list = await cards(page);
  check("all ten documents listed", list.length === 10, String(list.length));
  const maxH = Math.max(...list.map((c) => c.h));
  check("every card compact (<= 150px)", maxH <= 150, `max ${maxH}`);
  const perScreen = await page.evaluate(() => {
    const cs = [...document.querySelectorAll("main div.space-y-2 > div.rounded-xl")];
    const top = cs[0].getBoundingClientRect().top;
    return cs.filter((c) => c.getBoundingClientRect().bottom - top <= 812).length;
  });
  check("at least 4 cards fit on one 812px screen", perScreen >= 4, String(perScreen));
  console.log("  card heights", list.map((c) => Math.round(c.h)).join(","), "cards per 812px:", perScreen);
  check("details hidden by default", !body.includes("Sort code") && !body.includes("Grab adhesive") && !body.includes("Delivery address"));
  check("page fits 375px (collapsed)", await fits(page));
  await page.evaluate(() => document.querySelector("main div.space-y-2").scrollIntoView());
  await page.screenshot({ path: new URL("receipts-compact-3302.png", import.meta.url).pathname });

  const r1 = await cardText(page, "SFX-4402119");
  check("bill due in 2 days: Supplier invoice + To pay · due", r1.includes("Supplier invoice") && /To pay · due \d+ \w{3}/.test(r1), r1);
  check("bill shows supplier name, amount incl. VAT net of credit", r1.startsWith("Screwfix") && r1.includes("£109.73"), r1);
  check("unpaid bill offers Mark as paid", r1.includes("Mark as paid"));
  const r2 = await cardText(page, "INV-GB-2026-1234");
  check("online order invoice: Supplier invoice + Paid", r2.includes("Supplier invoice") && /\nPaid\n/.test(r2) && !r2.includes("Mark as paid"), r2);
  check("unlinked document titled by its vendor", r2.startsWith("Amazon EU S.a r.l."), r2);
  const r3 = await cardText(page, "INV-GB-2026-0999");
  check("overdue bill says Overdue", /Overdue · was due/.test(r3), r3);
  const r4 = await cardText(page, "Tesco Express");
  check("receipt labelled Receipt, no payment status", r4.includes("Receipt") && !/To pay|Paid|Overdue/.test(r4), r4);
  const r5 = await cardText(page, "CN-88120");
  check("credit note labelled with negative amount", r5.includes("Credit note") && r5.includes("−£12.00"), r5);
  const r7 = await cardText(page, "TP-1");
  check("bill without due date: To pay", /\nTo pay\n/.test(r7), r7);
  const r8 = await cardText(page, "EMAILED-1");
  check("needs-review bill: badge, no Mark as paid", r8.includes("Needs review") && !r8.includes("Mark as paid"), r8);
  check("star/edit/remove on every card", (await cards(page)).every((c) => c.text.includes("★") && c.text.includes("Edit") && c.text.includes("Remove")));

  await clickInCard(page, "SFX-4402119", "Details");
  await sleep(200);
  let open = await cardText(page, "SFX-4402119");
  check("Details opens the long fields", ["Sort code: 20-00-00", "Delivery address:", "Supplier email:", "Account manager: Sam Taylor", "Grab adhesive", "3 pages", "Bathroom job at Elm Road", "elm-road", "excl. VAT", "credited"].every((t) => open.includes(t)), open);
  check("…only on that card", !(await cardText(page, "INV-GB-2026-1234")).includes("Supplier address"));
  check("page fits 375px with details open", await fits(page));
  await page.evaluate(() => [...document.querySelectorAll("main div.space-y-2 > div.rounded-xl")].find((x) => x.innerText.includes("SFX-4402119")).scrollIntoView());
  await page.screenshot({ path: new URL("receipts-details-open-3302.png", import.meta.url).pathname });
  await clickInCard(page, "SFX-4402119", "Details");
  await sleep(200);
  check("Details closes again", !(await cardText(page, "SFX-4402119")).includes("Sort code"));
  await clickInCard(page, "Shell", "Details");
  await sleep(100);
  check("foreign currency shown in details", (await cardText(page, "Shell")).includes("from EUR 70.00 @ 0.8571"));
  await clickInCard(page, "Shell", "Details");

  const setFilter = async (label, value) => { await page.select(`select[aria-label="${label}"]`, value); await sleep(200); };
  await setFilter("Payment status", "to_pay");
  check("To pay: unpaid supplier invoices, soonest due first", JSON.stringify(await titles(page)) === JSON.stringify(["AMAZON", "Screwfix", "Amazon", "Screwfix Direct Ltd", "Screwfix", "Travis Perkins Ltd"]), JSON.stringify(await titles(page)));
  await page.screenshot({ path: new URL("receipts-to-pay-3302.png", import.meta.url).pathname });
  await setFilter("Payment status", "overdue");
  check("Overdue: only the past-due bill", JSON.stringify(await titles(page)) === JSON.stringify(["AMAZON"]), JSON.stringify(await titles(page)));
  await setFilter("Payment status", "due_week");
  let t = await titles(page);
  check("Due in the next 7 days: today+2, +5, +7 (not +8, not overdue)", t.length === 3 && (await cardText(page, "SFX-4399000")) && !(await cardText(page, "SFX-4400001")) && !(await cardText(page, "INV-GB-2026-0999")), JSON.stringify(t));
  await setFilter("Payment status", "paid");
  check("Paid: paid supplier invoices only", JSON.stringify(await titles(page)) === JSON.stringify(["Amazon EU S.a r.l."]), JSON.stringify(await titles(page)));
  await setFilter("Payment status", "");
  await setFilter("Document type", "receipt");
  check("type filter: receipts", JSON.stringify(await titles(page)) === JSON.stringify(["Tesco Express", "Shell"]), JSON.stringify(await titles(page)));
  await setFilter("Document type", "credit_note");
  check("type filter: credit notes", (await cards(page)).length === 1 && (await cardText(page, "CN-88120")));
  await setFilter("Document type", "invoice");
  check("type filter: supplier invoices", (await cards(page)).length === 7, String((await cards(page)).length));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear filters").click());
  await sleep(200);
  check("Clear filters resets type and status", (await cards(page)).length === 10);

  const banner = await page.evaluate(() => [...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("match your suppliers"))?.innerText ?? "");
  check("link banner counts only matches to active suppliers", banner.startsWith("3 documents match your suppliers"), banner);
  const which = await page.evaluate(() => [...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("match your suppliers")).innerText);
  check("3 matches listed open, vendor → supplier", which.includes("Amazon EU S.a r.l. · INV-GB-2026-1234 → Amazon") && which.includes("AMAZON · INV-GB-2026-0999 → Amazon") && which.includes("Screwfix Direct Ltd · SFX-4399000 → Screwfix") && !which.includes("Travis") && !which.includes("Tesco") && !which.includes("which?"), which);
  check("…each ticked, button says Link 3", (await ticks(page)).join() === "true,true,true" && which.includes("Link 3"), JSON.stringify(await ticks(page)) + which);
  await page.screenshot({ path: new URL("receipts-link-banner-3302.png", import.meta.url).pathname });
  db.fail["PATCH receipts"] = 1;
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Link 3").click());
  await page.waitForFunction(() => document.body.innerText.includes("Couldn't link 1 of them"), { timeout: 8000 });
  check("a failed link is reported and stays on offer", await page.evaluate(() => document.body.innerText.includes("1 document matches your suppliers")));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Link 1").click());
  await page.waitForFunction(() => !document.body.innerText.includes("match your suppliers"), { timeout: 8000 });
  const byId = (id) => db.tables.receipts.find((r) => r.id === id);
  check("linking set client_id on the three matches", byId(R.r2).client_id === S2 && byId(R.r3).client_id === S2 && byId(R.r10).client_id === S1, JSON.stringify([byId(R.r2).client_id, byId(R.r3).client_id, byId(R.r10).client_id]));
  check("…and nothing else", byId(R.r4).client_id === null && byId(R.r7).client_id === null && byId(R.r9).client_id === null);
  check("…with only receipt updates (3 + 1 retried)", db.log.filter((l) => l.key === "PATCH receipts").length === 4, JSON.stringify(db.log.filter((l) => l.key === "PATCH receipts")));
  check("no supplier created", db.tables.clients.length === clientCount && !db.log.some((l) => l.key === "POST clients"));
  const r2b = await cardText(page, "INV-GB-2026-1234");
  check("linked card now titled by the supplier, printed name beside it", r2b.startsWith("Amazon\n"), r2b);
  await clickInCard(page, "INV-GB-2026-1234", "Details");
  await sleep(100);
  check("…with the name on the document in Details", (await cardText(page, "INV-GB-2026-1234")).includes("On the document: Amazon EU S.a r.l."));
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "SFX-4402119");
  await sleep(300);
  check("banner stays gone after reload (links persisted)", !(await page.evaluate(() => document.body.innerText.includes("match your suppliers"))));

  await clickInCard(page, "SFX-4402119", "Mark as paid");
  await sleep(500);
  check("Mark as paid still works from the compact card", db.tables.receipts.find((r) => r.id === R.r1).paid === true && /\nPaid\n/.test(await cardText(page, "SFX-4402119")));
  await clickInCard(page, "SFX-4402119", "Edit");
  await sleep(200);
  check("Edit still opens the form", await page.evaluate(() => !!document.querySelector('main input[placeholder="Shop or supplier"]')));

  const I = (n, status, due) => ({ id: newId(), user_id: "x", client_id: C1, date: day(-20), number: n, items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: null, due_date: due, payment_terms: "30 days", status, tags: [], vat_registered: status === "draft" ? null : true });
  db.tables.invoices.push(I("D-1", "draft", day(10)), I("S-1", "sent", day(10)), I("S-2", "sent", day(-3)), I("P-1", "partial", day(5)), I("PD-1", "paid", day(-1)));
  db.tables.credit_notes = []; db.tables.invoice_payments = [];
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await waitText(page, "S-1");
  await sleep(300);
  const invTitles = () => page.evaluate(() => [...document.querySelectorAll("main div.space-y-3 > div.rounded-xl")].map((c) => c.innerText.split(" · ")[0].trim()));
  const statusSelect = await page.evaluateHandle(() => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "to_receive")));
  check("invoices: To receive option present", !!(await statusSelect.asElement()));
  const opts = await page.evaluate(() => [...[...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "to_receive")).options].map((o) => o.textContent));
  check("…alongside the status and overdue options", JSON.stringify(opts) === JSON.stringify(["All statuses", "To receive (owed to me)", "Draft", "Sent", "Partially paid", "Paid", "Overdue"]), JSON.stringify(opts));
  await statusSelect.asElement().select("to_receive");
  await sleep(200);
  let it = await invTitles();
  check("To receive: sent and part-paid (incl. overdue), not draft or paid", JSON.stringify([...it].sort()) === JSON.stringify(["#P-1", "#S-1", "#S-2"]), JSON.stringify(it));
  await page.screenshot({ path: new URL("invoices-to-receive-3302.png", import.meta.url).pathname });
  await statusSelect.asElement().select("overdue");
  await sleep(200);
  check("Overdue still works", JSON.stringify(await invTitles()) === JSON.stringify(["#S-2"]), JSON.stringify(await invTitles()));
  await statusSelect.asElement().select("paid");
  await sleep(200);
  check("Paid still works", JSON.stringify(await invTitles()) === JSON.stringify(["#PD-1"]), JSON.stringify(await invTitles()));
  check("invoices page fits 375px", await fits(page));

  // ---- Stricter bulk matching, per-row choice, remembered skips, noSupplier ----
  const S4 = newId(), S5 = newId(), S6 = newId();
  db.tables.clients.push(
    { id: S4, user_id: "x", name: "Esso", kind: "supplier", archived: false, email: "", is_company: true },
    { id: S5, user_id: "x", name: "Costa", kind: "supplier", archived: false, email: "", is_company: true },
    { id: S6, user_id: "x", name: "Shell", kind: "supplier", archived: false, email: "", is_company: true }
  );
  db.tables.receipts.push(
    add("e1", { document_type: "receipt", client_id: null, vendor: "Espresso Bar", invoice_number: "ESP-1", date: day(-11), amount: 3, vat_amount: 0.6 }),
    add("e2", { document_type: "invoice", client_id: null, vendor: "Costain Ltd", invoice_number: "CST-1", date: day(-12), amount: 100, vat_amount: 20 }),
    add("e3", { document_type: "invoice", client_id: null, vendor: "Shellbrook Builders", invoice_number: "SHB-1", date: day(-13), amount: 200, vat_amount: 40 }),
    add("e4", { document_type: "receipt", client_id: null, vendor: "ESSO", invoice_number: "ESO-1", date: day(-14), amount: 40, vat_amount: 8 }),
    add("e5", { document_type: "receipt", client_id: null, vendor: "Costa Coffee Ltd", invoice_number: "CCL-1", date: day(-15), amount: 3.5, vat_amount: 0.7 }),
    add("e6", { document_type: "invoice", client_id: null, vendor: "Screwfix", invoice_number: "NOSUP-1", date: day(-16), amount: 10, vat_amount: 2, details: { noSupplier: true } }),
    add("e7", { document_type: "invoice", client_id: null, vendor: "Amazon Marketplace", invoice_number: "AMM-1", date: day(-17), amount: 25, vat_amount: 5, details: { orderNumber: "ORD-AMM" } }),
    add("e10", { document_type: "receipt", client_id: S4, vendor: "Espresso Bar Ltd", invoice_number: "EBL-1", date: day(-19), amount: 2, vat_amount: 0.4 })
  );
  await reloadReceipts(page);
  let bn = await bannerText(page);
  check("4 matches (>3): list collapsed behind which?, Link 4", bn.startsWith("4 documents match your suppliers") && bn.includes("which?") && !bn.includes("→") && bn.includes("Link 4"), bn);
  await clickButton(page, "which?");
  await sleep(150);
  bn = await bannerText(page);
  check("exact and whole-word matches suggested (ESSO, Costa Coffee Ltd, Shell, Amazon Marketplace)", bn.includes("ESSO · ESO-1 → Esso") && bn.includes("Costa Coffee Ltd · CCL-1 → Costa") && bn.includes("Shell → Shell") && bn.includes("Amazon Marketplace · AMM-1 → Amazon"), bn);
  check("substring look-alikes not suggested (Espresso Bar, Costain, Shellbrook)", !bn.includes("ESP-1") && !bn.includes("CST-1") && !bn.includes("SHB-1") && !bn.includes("Espresso") && !bn.includes("Costain") && !bn.includes("Shellbrook"), bn);
  check("a receipt with details.noSupplier is not offered", !bn.includes("NOSUP-1"), bn);
  check("all four ticked by default", (await ticks(page)).join() === "true,true,true,true", JSON.stringify(await ticks(page)));
  check("page fits 375px with the banner list open", await fits(page));
  await page.evaluate(() => [...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("your suppliers")).scrollIntoView());
  await page.screenshot({ path: new URL("receipts-link-banner-3302-four.png", import.meta.url).pathname });
  await untick(page, "CCL-1");
  await sleep(100);
  bn = await bannerText(page);
  check("untick one: button says Link 3", bn.includes("Link 3") && (await ticks(page)).filter(Boolean).length === 3, bn);
  const patchesBefore = db.log.filter((l) => l.key === "PATCH receipts").length;
  await clickButton(page, "Link 3");
  await page.waitForFunction(() => !document.body.innerText.includes("your suppliers"), { timeout: 8000 });
  check("only the ticked rows linked", byId(R.e4).client_id === S4 && byId(R.r9).client_id === S6 && byId(R.e7).client_id === S2 && byId(R.e5).client_id === null, JSON.stringify([byId(R.e4).client_id, byId(R.r9).client_id, byId(R.e7).client_id, byId(R.e5).client_id]));
  check("…nothing else touched (3 PATCHes; look-alikes and noSupplier row still unlinked)", db.log.filter((l) => l.key === "PATCH receipts").length - patchesBefore === 3 && [R.e1, R.e2, R.e3, R.e6].every((id) => byId(id).client_id === null));
  check("unticked row remembered on the device", (await skips(page)).includes(R.e5), JSON.stringify(await skips(page)));
  await reloadReceipts(page);
  check("unticked row not offered again after reload", !(await bannerText(page)), await bannerText(page));
  check("card shows Supplier · Vendor when the printed name isn't plainly the supplier", (await cardText(page, "EBL-1")).startsWith("Esso · Espresso Bar Ltd\n"), await cardText(page, "EBL-1"));
  check("…and just the supplier when it plainly is (Amazon Marketplace)", (await cardText(page, "AMM-1")).startsWith("Amazon\n"), await cardText(page, "AMM-1"));
  check("…and just the supplier when the printed name is the same (normalised)", (await cardText(page, "ESO-1")).startsWith("Esso\n") && (await cardText(page, "SFX-4400001")).startsWith("Screwfix\n"), (await cardText(page, "ESO-1")) + " | " + (await cardText(page, "SFX-4400001")));
  check("page fits 375px with Supplier · Vendor titles", await fits(page));

  const editSelect = async () => page.evaluateHandle(() => document.querySelector('main input[placeholder="Shop or supplier"]').closest("div.rounded-xl").querySelector("select"));
  await clickInCard(page, "AMM-1", "Edit");
  await sleep(200);
  await (await editSelect()).asElement().select("");
  await clickButton(page, "Save");
  await page.waitForFunction(() => !document.querySelector('main input[placeholder="Shop or supplier"]'), { timeout: 8000 });
  await sleep(200);
  check("Edit → No supplier writes details.noSupplier (other details kept)", byId(R.e7).client_id === null && byId(R.e7).details?.noSupplier === true && byId(R.e7).details?.orderNumber === "ORD-AMM", JSON.stringify(byId(R.e7)));
  check("…and the link offer doesn't bring it back", !(await bannerText(page)), await bannerText(page));
  await reloadReceipts(page);
  check("…nor after reload", !(await bannerText(page)) && (await cardText(page, "AMM-1")).startsWith("Amazon Marketplace\n"), (await bannerText(page)) + " | " + (await cardText(page, "AMM-1")));
  await clickInCard(page, "AMM-1", "Edit");
  await sleep(200);
  await (await editSelect()).asElement().select(S2);
  await clickButton(page, "Save");
  await page.waitForFunction(() => !document.querySelector('main input[placeholder="Shop or supplier"]'), { timeout: 8000 });
  await sleep(200);
  check("picking a supplier again removes noSupplier", byId(R.e7).client_id === S2 && !("noSupplier" in (byId(R.e7).details ?? {})) && byId(R.e7).details?.orderNumber === "ORD-AMM", JSON.stringify(byId(R.e7).details));
  const detailPatches = db.log.filter((l) => l.key === "PATCH receipts" && l.body && "details" in l.body).length;
  await clickInCard(page, "ESO-1", "Edit");
  await sleep(200);
  await clickButton(page, "Save");
  await page.waitForFunction(() => !document.querySelector('main input[placeholder="Shop or supplier"]'), { timeout: 8000 });
  check("an edit that keeps the supplier leaves details alone", db.log.filter((l) => l.key === "PATCH receipts" && l.body && "details" in l.body).length === detailPatches && byId(R.e4).client_id === S4);

  db.tables.receipts.push(add("e8", { document_type: "receipt", client_id: null, vendor: "Esso Express", invoice_number: "ESX-1", date: day(-18), amount: 30, vat_amount: 6 }));
  await reloadReceipts(page);
  bn = await bannerText(page);
  check("a new match shows the banner (1 row, open, Link 1)", bn.startsWith("1 document matches your suppliers") && bn.includes("Esso Express · ESX-1 → Esso") && bn.includes("Link 1") && !bn.includes("CCL-1"), bn);
  await page.evaluate(() => [...document.querySelectorAll("main div.rounded-xl")].find((d) => d.innerText.includes("your suppliers")).scrollIntoView());
  await page.screenshot({ path: new URL("receipts-link-banner-3302-one.png", import.meta.url).pathname });
  await page.evaluate(() => document.querySelector('button[aria-label="Dismiss"]').click());
  await sleep(150);
  check("✕ hides it", !(await bannerText(page)));
  await reloadReceipts(page);
  check("✕ dismissal survives reload", !(await bannerText(page)) && (await skips(page)).includes(R.e8) && byId(R.e8).client_id === null, await bannerText(page));
  db.tables.receipts.push(add("e9", { document_type: "receipt", client_id: null, vendor: "Shell Garage", invoice_number: "SHG-1", date: day(-19), amount: 60, vat_amount: 12 }));
  await reloadReceipts(page);
  bn = await bannerText(page);
  check("…and a later new match still shows, without the dismissed one", bn.startsWith("1 document matches your suppliers") && bn.includes("SHG-1 → Shell") && !bn.includes("ESX-1"), bn);
  await page.evaluate(() => localStorage.setItem("receipts-link-skip", "not json"));
  await reloadReceipts(page);
  bn = await bannerText(page);
  check("unreadable storage: page still renders, skips just forgotten", bn.startsWith("3 documents match your suppliers") && ["CCL-1", "ESX-1", "SHG-1"].every((x) => bn.includes(x)) && (await cards(page)).length === 20, bn);
} catch (e) { console.log("ERROR", e.message); await shot(page, "receipts-list-3302-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
