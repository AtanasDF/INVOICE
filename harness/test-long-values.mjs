// Long names and big numbers, on a phone. A 60-character company name and
// £1,234,567.89 must not push the page sideways, overlap anything, or have
// digits cut off -- a truncated total is a wrong total to whoever reads it.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const LONG = "Worcestershire & Herefordshire Building Contractors Limited";
const LONGER = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Joinery & Shopfitting Co-operative Limited";

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: LONG, vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 400, address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", bank_details: "Sort code: 12-34-56\nAccount: 12345678", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: LONGER, email: "accounts.payable.department@herefordshire-building-contractors.co.uk", address: "Unit 14, The Old Maltings Industrial Estate\nKidderminster\nDY10 1HS", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "GB123456789", payment_terms: "30 days", default_currency: "", contact_person: "Mr Jonathan Fitzwilliam-Hetherington", phone: "01562 123456", company_number: "01234567" });
const S = newId();
db.tables.clients.push({ id: S, user_id: "x", name: "Travis Perkins Trading Company Limited (Kidderminster Branch)", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const BIG = { id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "INV-000400", items: [
  { description: "Structural steelwork, fabrication and erection across the whole of phase two including all fixings", quantity: 1, unitPrice: 1029639.91, vatRate: "standard" },
  // One unbroken run -- no hyphens, so no break opportunities: a reference
  // typed in, or filled in from a scan.
  // It used to widen the table past the sheet, and the PDF is drawn at a
  // fixed width, so the Amount column was cut off the customer's copy.
  { description: "REFPO2026KIDDERMINSTERPHASETWOSTRUCTURALSTEELWORK0000418872REVISIONC", quantity: 1, unitPrice: 0, vatRate: "standard" },
], notes: "Materials supplied by the client.\nGuarantee: 12 months on labour.\nPlease pay by bank transfer to the account above.", due_date: day(-40), payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(BIG);
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: BIG.id, date: day(-10), amount: 234567.89, method: "bank", note: "" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: S, date: todayISO(), vendor: "Travis Perkins Trading Company Limited (Kidderminster Branch)", category: "Supplies", amount: 987654.32, vat_amount: 197530.86, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "TP-2026-000123456", due_date: day(2), paid: false, details: { reference: "REF" + "X".repeat(60), supplierAddress: "Unit 14 The Old Maltings Industrial Estate Kidderminster DY10 1HS" }, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

const PAGES = [["/", "Dashboard"], ["/invoices", "Invoices"], [`/invoices/${BIG.id}`, "The invoice"], ["/receipts", "Receipts"], ["/clients", "Contacts"], ["/expenses", "Expenses"], ["/vat", "VAT"], [`/clients/${C}/statement`, "Statement"]];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-long" });
try {
  await signIn(page, BASE);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1100);
    const t = await bodyText(page);
    check(`${name} opens with long names and big numbers`, t.length > 60 && !t.includes("Application error"), t.slice(0, 200));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    // Name the elements that stick out, so a failure says where to look.
    const sticking = fits ? [] : await page.evaluate(() => {
      const w = window.innerWidth;
      const out = [...document.querySelectorAll("*")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.right > w + 1 && r.width > 0)
        .map((x) => { let d = 0, n = x.el; while ((n = n.parentElement)) d++; return { ...x, d }; })
        .sort((a, b) => b.d - a.d);
      const wide = [...document.querySelectorAll("*")].filter((el) => el.scrollWidth > w + 1 && getComputedStyle(el).overflowX !== "auto" && getComputedStyle(el).overflowX !== "scroll").map((el) => `WIDE ${el.tagName}.${(el.className||"").toString().slice(0,40)} sw=${el.scrollWidth}`).slice(0, 4);
      if (!out.length) return wide;
      return out.slice(0, 4).map(({ el, r }) => `${el.tagName}.${(el.className || "").toString().slice(0, 40)} right=${Math.round(r.right)} :: ${(el.textContent || "").trim().slice(0, 35)}`);
    });
    check(`${name} doesn't run off a 375px screen`, fits, `${await page.evaluate(() => document.documentElement.scrollWidth)}px | ${sticking.join(" | ")}`);
    // Any element whose whole text is one money figure must show all of it.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll("span, td, dd, p, strong, div")]
        .filter((el) => el.children.length === 0 && /^[−-]?£[\d,]+\.\d{2}$/.test(el.textContent.trim()))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim())
    );
    check(`${name} shows every money figure in full`, cut.length === 0, JSON.stringify(cut));
  }
  // The figures themselves, with separators, on the invoice.
  await page.goto(`${BASE}/invoices/${BIG.id}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const t = await bodyText(page);
  // The sheet the customer is sent. The page can fit while the sheet's own
  // table does not: it sits in an overflow-x-auto box, so on screen it
  // scrolls, and in the PDF -- drawn at a fixed width -- it is simply cut,
  // taking the Amount column with it.
  // The PDF is photographed from a sheet exactly PAGE_WIDTH (794px) wide
  // with PAGE_MARGIN (53) padding, so its content box is 688px and cannot
  // scroll. On screen the same table sits in an overflow-x-auto box and a
  // wide viewport hides the problem entirely -- measuring there passes
  // whether or not the bug is present. So the table is measured in a 688px
  // box of its own, which is the width the customer's copy is drawn at.
  await page.goto(`${BASE}/invoices/${BIG.id}`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const sheet = await page.evaluate(() => {
    const table = [...document.querySelectorAll("table")].find((el) => /Description/i.test(el.innerText));
    if (!table) return null;
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-9999px;top:0;width:688px;overflow:hidden";
    box.appendChild(table.cloneNode(true));
    document.body.appendChild(box);
    const needed = box.firstElementChild.scrollWidth;
    box.remove();
    return { needed, sheet: 688 };
  });
  check("a long unbroken reference doesn't push the money columns off the sheet", sheet && sheet.needed <= sheet.sheet + 1, JSON.stringify(sheet));

  await page.setViewport({ width: 375, height: 780, deviceScaleFactor: 1 });
  const notes = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /Materials supplied by the client/.test(d.textContent ?? "") && d.children.length === 0);
    return el ? { ws: getComputedStyle(el).whiteSpace, height: el.getBoundingClientRect().height } : null;
  });
  check("notes typed on separate lines stay on separate lines", notes && /pre-line|pre-wrap|pre/.test(notes.ws), JSON.stringify(notes));

  check("a seven-figure total is grouped and complete", t.includes("£1,029,639.91") && t.includes("£1,235,567.89"), t.match(/£[\d,]+\.\d{2}/g)?.join(" ") ?? "none");
  check("the payment and the balance both read in full", t.includes("£234,567.89") && t.includes("£1,001,000.00"), t.match(/£[\d,]+\.\d{2}/g)?.join(" ") ?? "none");
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
